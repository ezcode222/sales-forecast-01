import {
  CUSTOMER_MASTER_VIEW,
  getCustomerMasterCacheCount,
  lookupCustomerNamesRaw,
  syncCustomerMasterCache,
} from '../src/api/services/customerMaster.ts';
import prisma from '../src/db/prisma.ts';

console.log('=== Customer Master Sync Test ===');
console.log('View:', CUSTOMER_MASTER_VIEW);

const before = await getCustomerMasterCacheCount().catch(() => -1);
console.log('Cache rows before:', before);

const result = await syncCustomerMasterCache();
console.log('\nSync result:', result);

if (!result.ok) {
  console.log('\n*** SYNC FAILED — ต้องขอ DBA grant SELECT บน view ให้ app SQL user ***');
  console.log('Error:', result.error);
  process.exit(1);
}

const after = await getCustomerMasterCacheCount();
console.log('Cache rows after:', after);

const sampleCodes = ['12036', '80443', '80481', '80431', '9116'];
const names = await lookupCustomerNamesRaw(sampleCodes);
console.log('\nSample master names:');
for (const code of sampleCodes) {
  console.log(`  ${code}: ${names.get(code) ?? '(not in cache)'}`);
}

await prisma.$disconnect();
