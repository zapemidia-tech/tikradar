import type {SaturationLevel} from '@/types';
export function calculateSaturationScore(input:{creators:number;videos:number;sellers:number;sales:number;newCreatorGrowth:number}){const supply=Math.min(100,input.creators*.55+input.videos*.07+input.sellers*4);const efficiency=Math.min(100,input.sales/Math.max(1,input.creators));return Math.round(Math.max(0,Math.min(100,supply*.7+input.newCreatorGrowth*.2-efficiency*.1)))}
export function classifySaturation(score:number):SaturationLevel{return score<20?'Muito baixa':score<40?'Baixa':score<60?'Média':score<80?'Alta':'Muito alta'}
