import type{BestsellersAdapter}from'./adapters';import type{BestsellersService}from'./bestsellers-service';import type{SyncRepository}from'./sync-repository';import type{BestsellersKind,BestsellersPeriod,SyncCounts,TikTokCurrency}from'@/lib/tiktok/types';import{describeUnknownError}from'@/lib/tiktok/errors';import{formatReferenceDateForDisplay}from'@/lib/tiktok/reference-date';

interface SyncOutcome{count:number;dateUsed:string}

export class TikTokBestsellersSyncService{
  constructor(private service:BestsellersService,private adapter:BestsellersAdapter,private repo:SyncRepository,private currency:TikTokCurrency='LOCAL'){}

  private async sync(kind:BestsellersKind,period:BestsellersPeriod='7D'):Promise<SyncOutcome>{
    try{
      const{envelope,dateUsed}=kind==='products'?await this.service.getBestsellingProducts({period,currency:this.currency}):kind==='creators'?await this.service.getBestsellingCreators({period,currency:this.currency}):kind==='videos'?await this.service.getBestsellingVideos({period,currency:this.currency}):await this.service.getBestsellingLives({period,currency:this.currency});
      const items=this.adapter.normalize(kind,envelope,this.currency);
      await this.repo.persist(kind,items,period);
      return{count:items.length,dateUsed};
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
    const dateUsedByKind:Partial<Record<BestsellersKind,string>>={};
    const tasks:Array<[BestsellersKind,()=>Promise<SyncOutcome>]>=[
      ['products',()=>this.syncProducts(period)],
      ['creators',()=>this.syncCreators(period)],
      ['videos',()=>this.syncVideos(period)],
      ['lives',()=>this.syncLives(period)],
    ];

    const errors:string[]=[];
    await Promise.all(tasks.map(async([kind,run])=>{
      try{const outcome=await run();counts[kind]=outcome.count;dateUsedByKind[kind]=outcome.dateUsed}
      catch(error){errors.push(describeUnknownError(error))}
    }));

    // As 4 chamadas calculam a mesma data de referência de forma
    // independente (mesmo fuso, mesma regra) — na prática convergem para o
    // mesmo dia. Guardamos a primeira disponível, em ordem fixa, como a
    // data efetivamente usada nesta sincronização (requisito: registrar em
    // data_sync_runs). Sem coluna nova disponível nesta entrega, isso vai
    // em `error_message` mesmo em sucesso — não é um erro, é uma nota.
    const referenceDate=dateUsedByKind.products??dateUsedByKind.creators??dateUsedByKind.videos??dateUsedByKind.lives;
    const referenceNote=referenceDate?`Dados referentes a ${formatReferenceDateForDisplay(referenceDate)}`:undefined;

    if(errors.length){
      const message=errors.join(' | ');
      try{await this.repo.finishRun(runId,'failed',counts,message)}
      catch(finishError){throw new Error(`${message} — Falha ao registrar diagnóstico: ${describeUnknownError(finishError)}`)}
      throw new Error(message);
    }

    // Opportunity Score depende do histórico de product_snapshots recém
    // gravado. Recalcular aqui é o que preenche opportunity_scores com
    // dados reais — uma falha nesse passo não deve derrubar uma
    // sincronização que já teve sucesso, então só registra e segue.
    try{await this.repo.recomputeOpportunityScores()}
    catch(error){console.error('Falha ao recalcular Opportunity Score:',describeUnknownError(error))}

    await this.repo.finishRun(runId,'success',counts,referenceNote);
    return counts;
  }
}
