import benchmarks from './wod-catalog.json' with {type:'json'};
import daily from './wod-daily-examples.json' with {type:'json'};
import type {WodExample} from './wod-examples';

// This is the single browser/server catalog entry point. Keep source order:
// daily supplements first, then the complete benchmark snapshot.
export const benchmarkCatalog=benchmarks;
export const dailyCatalog=daily;
export const wodExamples:WodExample[]=[...daily.examples,...benchmarks.examples] as WodExample[];
// Reviewed partner/team prescriptions, including two entries without a partner
// family tag. Eligibility is explicit, so prose changes cannot change the set.
export const individualExcludedIds=[
 'wp130019','wp124314','wp129988','wp129854','wp130009',
 'wp129920','wp124303','wp124355','wp159008','wp129967',
 'wp124016','wp158302','wp130034','wp129857','wp124299',
] as const;
const excluded=new Set<string>(individualExcludedIds);
export const individualExamples=wodExamples.filter(example=>!excluded.has(example.id));
export const catalogDisclaimer='WOD Crew is an independent personal project and is not affiliated with or endorsed by CrossFit.';
