import { afterEach, expect, it, vi } from 'vitest';
import type { RaceConfig } from '../src/sim/race.ts';
import type { CityConfig } from '../src/sim/cityRun.ts';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.resetModules();});
it('rejects both run modes on transport failure and creates a fresh worker for retry',async()=>{
  const workers:FakeWorker[]=[];
  class FakeWorker {
    onerror:((e:{message:string})=>void)|null=null;
    onmessage:((e:unknown)=>void)|null=null;
    onmessageerror:(()=>void)|null=null;
    postMessage=vi.fn();terminate=vi.fn();
    constructor(){workers.push(this);}
  }
  vi.stubGlobal('Worker',FakeWorker);vi.spyOn(console,'error').mockImplementation(()=>{});
  const {liveSim}=await import('../src/sim/client.ts');
  const race=liveSim.race({} as RaceConfig,[],1,()=>{});
  const city=liveSim.city({} as CityConfig,()=>{});
  const completed=Promise.allSettled([race.done,city.done]);
  workers[0].onerror!({message:'Worker could not load'});
  expect((await completed).map(r=>r.status)).toEqual(['rejected','rejected']);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  const retry=liveSim.city({} as CityConfig,()=>{});
  expect(workers).toHaveLength(2);
  const rejected=expect(retry.done).rejects.toThrow('Could not read');
  workers[1].onmessageerror!();await rejected;
});
