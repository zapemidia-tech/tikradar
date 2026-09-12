import{describe,it,expect}from'vitest';import{normalizeGmvRange,parseGmvRangeString}from'@/services/tiktok/adapters';
describe('GMV dessensibilizado',()=>{it('preserva faixa e marca como não exato',()=>expect(normalizeGmvRange({min:100,max:200,currency:'LOCAL'})).toEqual({gmvMin:100,gmvMax:200,gmvEstimated:150,gmvDisplay:'100 – 200',currency:'LOCAL',isExact:false}));it('não inventa faixa ausente',()=>expect(normalizeGmvRange({min:null,max:null,currency:'USD'}).gmvEstimated).toBeNull())})

describe('parseGmvRangeString — parsing real de "gmv_range" (ex.: "BRL638343.60~BRL1067572.58")',()=>{
  it('separa min/max e moeda de uma faixa real em BRL',()=>{
    expect(parseGmvRangeString('BRL638343.60~BRL1067572.58')).toEqual({min:638343.6,max:1067572.58,currency:'BRL'});
  });
  it('aceita o traço "-" como separador, visto em outras respostas',()=>{
    expect(parseGmvRangeString('BRL100.00-BRL200.00')).toEqual({min:100,max:200,currency:'BRL'});
  });
  it('moeda fica null quando os dois lados divergem (nunca assume uma moeda não vista)',()=>{
    expect(parseGmvRangeString('BRL100.00~USD200.00').currency).toBeNull();
  });
  it('reconhece sufixos K/M/B (mesma regra usada para valores compactos)',()=>{
    expect(parseGmvRangeString('BRL1.5K~BRL2M')).toEqual({min:1500,max:2000000,currency:'BRL'});
  });
  it('string sem número reconhecível retorna min/max null, nunca 0 inventado',()=>{
    expect(parseGmvRangeString('BRL~BRL').min).toBeNull();
  });
});
