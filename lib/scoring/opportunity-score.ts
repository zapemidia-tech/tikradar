export interface OpportunityInputs{salesAcceleration:number;gmvGrowth:number;creatorGrowth:number;videoGrowth:number;commission:number;competition:number;price:number}
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
export function calculateOpportunityScore(input:OpportunityInputs){
  const normalized={salesAcceleration:clamp(input.salesAcceleration),gmvGrowthScore:clamp(input.gmvGrowth),creatorGrowthScore:clamp(input.creatorGrowth),videoGrowthScore:clamp(input.videoGrowth),commissionScore:clamp(input.commission*5),competitionScore:clamp(100-input.competition),priceScore:clamp(input.price>=30&&input.price<=120?90:input.price<250?65:40)};
  return Math.round(normalized.salesAcceleration*.30+normalized.gmvGrowthScore*.20+normalized.creatorGrowthScore*.15+normalized.videoGrowthScore*.10+normalized.commissionScore*.10+normalized.competitionScore*.10+normalized.priceScore*.05);
}
export function classifyOpportunity(score:number){return score>=90?'Forte oportunidade':score>=75?'Tendência':score>=60?'Interessante':score>=40?'Neutro':'Fraco'}
export function calculateSnapshotOpportunityScore(input:{rankingVelocity:number;salesGrowth:number;gmvGrowth:number;creatorGrowth:number;videoGrowth:number;saturation:number;momentum:number}){const positive=(n:number,scale=1)=>clamp(50+n*scale);return Math.round(positive(input.rankingVelocity,3)*.22+positive(input.salesGrowth,.5)*.20+positive(input.gmvGrowth,.4)*.13+positive(input.creatorGrowth,.6)*.10+positive(input.videoGrowth,.5)*.08+clamp(100-input.saturation)*.12+positive(input.momentum,2)*.15)}
