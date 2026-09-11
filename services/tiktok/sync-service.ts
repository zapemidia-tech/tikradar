import type{BestsellersAdapter}from'./adapters';import type{BestsellersService}from'./bestsellers-service';import type{SyncRepository}from'./sync-repository';import type{BestsellersKind,BestsellersPeriod,SyncCounts,TikTokCurrency}from'@/lib/tiktok/types';import{describeUnknownError}from'@/lib/tiktok/errors';

export class TikTokBestsellersSyncService{
  constructor(private service:BestsellersService,private adapter:BestsellersAdapter,private repo:SyncRepository,private currency:TikTokCurrency='LOCAL'){}

  private async sync(kind:BestsellersKind,period:BestsellersPeriod='7D'){
    try{
      const response=kind==='products'?await this.service.getBestsellingProducts({period,currency:this.currency}):kind==='creators'?await this.service.getBestsellingCreators({period,currency:this.currency}):kind==='videos'?await this.service.getBestsellingVideos({period,currency:this.currency}):await this.service.getBestsellingLives({period,currency:this.currency});
      const items=this.adapter.normalize(kind,response,this.currency);
      await this.repo.persist(kind,items,period);
      return items.length;
    }catch(error){
      throw new Error(`Falha em ${kind}: ${describeUnknownError(error)}`,{cause:error});
    }
  }

  syncProducts(p?:BestsellersPeriod){return this.sync('products',p)}
  syncCreators(p?:BestsellersPeriod){return this.sync('creators',p)}
  syncVideos(p?:BestsellersPeriod){return this.sync('videos',p)}
  syncLives(p?:BestsellersPeriod){return this.sync('lives',p)}

  // As quatro coleções são independentes entre si (fontes e tabelas
  // diferentes), então rodam em paralelo via Promise.all em vez de em série.
  // Isso corta o tempo total de ~soma dos quatro para ~o mais lento deles —
  // essencial para caber no limite de duração de função da Vercel. Cada
  // tarefa captura seu próprio erro (em vez de deixar Promise.all rejeitar
  // na primeira falha) para que uma coleção com problema não descarte as
  // contagens das que deram certo.
  async syncAll(period:BestsellersPeriod='7D'):Promise<SyncCounts>{
    const runId=await this.repo.startRun('tiktok');
    const counts:SyncCounts={products:0,creators:0,videos:0,lives:0};
    const tasks:Array<[BestsellersKind,()=>Promise<number>]>=[
      ['products',()=>this.syncProducts(period)],
      ['creators',()=>this.syncCreators(period)],
      ['videos',()=>this.syncVideos(period)],
      ['lives',()=>this.syncLives(period)],
    ];

    const errors:string[]=[];
    await Promise.all(tasks.map(async([kind,run])=>{
      try{counts[kind]=await run()}
      catch(error){errors.push(describeUnknownError(error))}
    }));

    if(errors.length){
      const message=errors.join(' | ');
      try{await this.repo.finishRun(runId,'failed',counts,message)}
      catch(finishError){throw new Error(`${message} — Falha ao registrar diagnóstico: ${describeUnknownError(finishError)}`)}
      throw new Error(message);
    }

    await this.repo.finishRun(runId,'success',counts);
    return counts;
  }
}
