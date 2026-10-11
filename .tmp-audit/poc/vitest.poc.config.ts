export default {
  root: 'E:/Project/Web/pms-internal/backend',
  cacheDir: 'E:/Project/Web/pms-internal/.tmp-audit/poc/.cache',
  test: {
    globals: true,
    environment: 'node',
    include: ['../.tmp-audit/poc/*.poc.test.ts'],
    testTimeout: 60000,
  },
};
