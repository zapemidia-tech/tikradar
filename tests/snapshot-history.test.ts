import{it,expect}from'vitest';import{appendSnapshot}from'@/lib/tiktok/snapshots';
it('acrescenta snapshots sem sobrescrever histórico',()=>{const first={ranking:91};const history=appendSnapshot([],first);const next=appendSnapshot(history,{ranking:72});expect(history).toEqual([first]);expect(next).toEqual([{ranking:91},{ranking:72}])})
