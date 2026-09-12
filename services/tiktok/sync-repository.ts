import{createClient,type SupabaseClient}from'@supabase/supabase-js';import type{BestsellersKind,BestsellersPeriod,NormalizedBestseller}from'@/lib/tiktok/types';import{TikTokConfigError}from'@/lib/tiktok/errors';import{groupSnapshotsByEntity,growthBetween}from'@/lib/tiktok/snapshot-reduce';import{calculateRankingVelocity,calculateMomentum,type RankedSnapshot}from'@/lib/scoring/snapshot-analytics';import{calculateRealOpportunityScore}from'@/lib/scoring/real-opportunity-score';

export interface SyncRepository{
  startRun(provider:string):Promise<string>;
  finishRun(id:string,status:'success'|'failed',counts:Record<BestsellersKind,number>,error?:string):Promise<void>;
  persist(kind:BestsellersKind,items:NormalizedBestseller[],period:BestsellersPeriod):Promise<void>;
  recomputeOpportunityScores():Promise<number>;
}

// Tamanho de lote por requisição ao Supabase. Evita um único payload gigante
// e mantém o número de round-trips baixo mesmo com centenas de itens.
const BATCH_SIZE=200;
function chunk<T>(items:T[],size:number):T[][]{const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out}

export class SupabaseSyncRepository implements SyncRepository{
  private client:SupabaseClient;
  constructor(env:NodeJS.ProcessEnv=process.env){if(!env.NEXT_PUBLIC_SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new TikTokConfigError('Supabase server-side não configurado.');this.client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})}

  async startRun(provider:string){const{data,error}=await this.client.from('data_sync_runs').insert({provider,status:'running'}).select('id').single();if(error)throw error;return data.id}

  async finishRun(id:string,status:'success'|'failed',counts:Record<BestsellersKind,number>,error?:string){const{error:e}=await this.client.from('data_sync_runs').update({finished_at:new Date().toISOString(),status,products_received:counts.products,creators_received:counts.creators,videos_received:counts.videos,lives_received:counts.lives,error_message:error?.slice(0,500)}).eq('id',id);if(e)throw e}

  // Antes: 1 upsert + 1 insert POR ITEM, em série (centenas de round-trips
  // sequenciais ao Supabase). Agora: entidades e snapshots são gravados em
  // lotes, cada lote com uma única requisição, rodando em paralelo.
  async persist(kind:BestsellersKind,items:NormalizedBestseller[],period:BestsellersPeriod){
    if(!items.length)return;
    const entityTable=kind==='products'?'products':kind==='creators'?'creators':kind==='videos'?'videos':'lives';
    const snapshotTable=kind==='products'?'product_snapshots':kind==='creators'?'creator_snapshots':kind==='videos'?'video_snapshots':'live_snapshots';
    const foreignKey=kind==='products'?'product_id':kind==='creators'?'creator_id':kind==='videos'?'video_id':'live_id';

    // Para vídeos, resolve creator_id/product_id a partir dos external ids já
    // conhecidos (criadores/produtos que já fazem parte do catálogo). Só
    // lookup — nunca cria um criador/produto "vazio" só para linkar um vídeo.
    let creatorIdByExternalId=new Map<string,string>();
    let productIdByExternalId=new Map<string,string>();
    if(kind==='videos'){
      const creatorExternalIds=[...new Set(items.map((i)=>i.creatorExternalId).filter((v):v is string=>Boolean(v)))];
      const productExternalIds=[...new Set(items.map((i)=>i.productExternalId).filter((v):v is string=>Boolean(v)))];
      const[creatorsLookup,productsLookup]=await Promise.all([
        creatorExternalIds.length?this.client.from('creators').select('id,external_id').in('external_id',creatorExternalIds):Promise.resolve({data:[],error:null}),
        productExternalIds.length?this.client.from('products').select('id,external_id').in('external_id',productExternalIds):Promise.resolve({data:[],error:null}),
      ]);
      if(creatorsLookup.error)throw creatorsLookup.error;
      if(productsLookup.error)throw productsLookup.error;
      creatorIdByExternalId=new Map((creatorsLookup.data??[]).map((r)=>[r.external_id as string,r.id as string]));
      productIdByExternalId=new Map((productsLookup.data??[]).map((r)=>[r.external_id as string,r.id as string]));
    }

    // Para produtos, cria/atualiza a loja (shops) quando shop_id/shop_name
    // vêm confiáveis no payload, e linka o produto a ela. shops.name é
    // NOT NULL: sem nome, não criamos uma loja "vazia" — o produto fica sem
    // shop_id, como já acontecia.
    const shopIdByExternalId=new Map<string,string>();
    if(kind==='products'){
      const shopEntityByExternalId=new Map<string,Record<string,unknown>>();
      for(const item of items){
        if(!item.shopExternalId||!item.shopName)continue;
        shopEntityByExternalId.set(item.shopExternalId,{external_id:item.shopExternalId,name:item.shopName});
      }
      if(shopEntityByExternalId.size){
        await Promise.all(chunk([...shopEntityByExternalId.values()],BATCH_SIZE).map(async(batch)=>{
          const{data,error}=await this.client.from('shops').upsert(batch,{onConflict:'external_id'}).select('id,external_id');
          if(error)throw error;
          for(const row of data??[])shopIdByExternalId.set(row.external_id as string,row.id as string);
        }));
      }
    }

    // 1) upsert das entidades em lote (dedupe por external_id: o Postgres
    //    rejeita um upsert que tente afetar a mesma linha duas vezes no
    //    mesmo comando).
    const entityByExternalId=new Map<string,Record<string,unknown>>();
    for(const item of items){
      const entity:Record<string,unknown>={external_id:item.externalId};
      if(kind!=='videos')entity.name=item.name??`${kind} ${item.externalId}`;
      if(kind==='products'){
        if(item.shopExternalId&&shopIdByExternalId.has(item.shopExternalId))entity.shop_id=shopIdByExternalId.get(item.shopExternalId);
        if(item.imageUrl)entity.image_url=item.imageUrl;
      }
      if(kind==='creators'){
        if(item.username)entity.username=item.username;
        if(item.followersCount!==undefined)entity.followers=item.followersCount;
      }
      if(kind==='videos'){
        if(item.creatorExternalId&&creatorIdByExternalId.has(item.creatorExternalId))entity.creator_id=creatorIdByExternalId.get(item.creatorExternalId);
        if(item.productExternalId&&productIdByExternalId.has(item.productExternalId))entity.product_id=productIdByExternalId.get(item.productExternalId);
        if(item.publishTimeIso)entity.posted_at=item.publishTimeIso;
      }
      entityByExternalId.set(item.externalId,entity);
    }

    const idByExternalId=new Map<string,string>();
    await Promise.all(chunk([...entityByExternalId.values()],BATCH_SIZE).map(async(batch)=>{
      const{data,error}=await this.client.from(entityTable).upsert(batch,{onConflict:'external_id'}).select('id,external_id');
      if(error)throw error;
      for(const row of data??[])idByExternalId.set(row.external_id as string,row.id as string);
    }));

    // 2) insert dos snapshots em lote, uma linha por item original.
    const rows=items.map((item)=>{
      const id=idByExternalId.get(item.externalId);
      if(!id)throw new Error(`Falha ao localizar id gravado para ${item.externalId} (${kind}).`);
      const row:Record<string,unknown>={[foreignKey]:id,captured_at:new Date().toISOString(),ranking:item.ranking,period,gmv_min:item.gmv.gmvMin,gmv_max:item.gmv.gmvMax,gmv_estimated:item.gmv.gmvEstimated,raw_payload:item.rawPayload};
      if(kind==='products')Object.assign(row,{sold_count:item.soldCount,price:item.price,creator_count:item.creatorCount,video_count:item.videoCount,review_count:item.reviewCount,rating:item.rating});
      if(kind==='creators')Object.assign(row,{sales:item.soldCount,video_count:item.videoCount});
      if(kind==='videos')Object.assign(row,{views:item.views,sales:item.soldCount,likes:item.likes,comments:item.comments,shares:item.shares,duration_seconds:item.durationSeconds,publish_time:item.publishTimeIso,engagement_rate:item.engagementRate});
      return row;
    });

    await Promise.all(chunk(rows,BATCH_SIZE).map(async(batch)=>{
      const{error}=await this.client.from(snapshotTable).insert(batch);
      if(error)throw error;
    }));
  }

  // Recalcula o Opportunity Score de cada produto a partir do histórico real
  // de product_snapshots (mesma fórmula usada na leitura, ver
  // lib/scoring/real-opportunity-score.ts) e grava um registro append-only
  // em opportunity_scores. Só grava quando um score foi de fato calculado —
  // produtos com histórico insuficiente (menos de 3 fatores reais
  // disponíveis) simplesmente não geram linha nesta rodada. Retorna quantos
  // produtos ganharam um score.
  async recomputeOpportunityScores():Promise<number>{
    const[{data:products,error:productsError},{data:snapshots,error:snapshotsError}]=await Promise.all([
      this.client.from('products').select('id'),
      this.client.from('product_snapshots').select('product_id,captured_at,ranking,gmv_estimated,creator_count,video_count,rating').eq('period','7D').order('captured_at',{ascending:false}).limit(4000),
    ]);
    if(productsError)throw productsError;
    if(snapshotsError)throw snapshotsError;

    type Row={capturedAt:string;ranking:number;gmvEstimated:number|null;creatorCount:number|null;videoCount:number|null;rating:number|null};
    const rows:(Row&{productId:string})[]=(snapshots??[]).map((s)=>({productId:s.product_id as string,capturedAt:s.captured_at as string,ranking:s.ranking as number,gmvEstimated:s.gmv_estimated,creatorCount:s.creator_count,videoCount:s.video_count,rating:s.rating}));
    const grouped=groupSnapshotsByEntity(rows,(r)=>r.productId);

    const entries:{product_id:string;score:number;saturation_score:number|null;factors:unknown}[]=[];
    for(const p of products??[]){
      const group=grouped.get(p.id as string);
      if(!group)continue;
      const{latest,previous,series}=group;
      const hasVelocity=series.length>=2;
      const rankedSeries:RankedSnapshot[]=series.map((s)=>({capturedAt:s.capturedAt,ranking:s.ranking}));
      const opportunity=calculateRealOpportunityScore({
        gmvGrowth7d:growthBetween(latest.gmvEstimated,previous?.gmvEstimated??null),
        rankingVelocity:hasVelocity?calculateRankingVelocity(rankedSeries):null,
        gmvVolume:latest.gmvEstimated,
        creatorsCount:latest.creatorCount,
        videosCount:latest.videoCount,
        rating:latest.rating,
        momentum:hasVelocity?calculateMomentum(rankedSeries):null,
      });
      if(!opportunity)continue;
      entries.push({product_id:p.id as string,score:opportunity.score,saturation_score:opportunity.saturationScore,factors:opportunity.factors});
    }

    if(entries.length){
      await Promise.all(chunk(entries,BATCH_SIZE).map(async(batch)=>{
        const{error}=await this.client.from('opportunity_scores').insert(batch);
        if(error)throw error;
      }));
    }
    return entries.length;
  }
}
