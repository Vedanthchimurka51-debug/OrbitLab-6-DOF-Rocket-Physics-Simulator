import { runAllVerificationTests } from './physicsVerification';

const report = runAllVerificationTests();

console.log('\n============================================================');
console.log('ORBITLAB 6-DOF HEADLESS PHYSICS VERIFICATION SUITE');
console.log(`Timestamp: ${report.timestampIso}`);
console.log('============================================================');

for (const res of report.results) {
  const badge = res.passed ? '[PASS]' : '[FAIL]';
  console.log(`\n${badge} ${res.name}`);
  console.log(`  Expected: ${res.expected}`);
  console.log(`  Measured: ${res.measured}`);
  console.log(`  Details : ${res.details}`);
}

console.log('\n------------------------------------------------------------');
console.log(`SUMMARY: ${report.results.filter((r) => r.passed).length}/${report.results.length} tests passed`);
console.log('------------------------------------------------------------\n');

if (!report.allPassed) {
  process.exit(1);
}
