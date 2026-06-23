const serverless = require('serverless-http');
const { app, init } = require('../../src/server');

let initPromise;
function ensureInit() {
  if (!initPromise) {
    initPromise = init();
  }
  return initPromise;
}

const handler = serverless(app);

module.exports.handler = async (event, context) => {
  await ensureInit();
  return handler(event, context);
};
