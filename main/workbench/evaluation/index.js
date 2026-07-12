/**
 * evaluation package exports
 */
module.exports = {
  ...require("./benchmarkRunner.js"),
  ...require("./evalFixtures.js"),
  runHiddenAcceptance: require("./hiddenAcceptances.js").runHiddenAcceptance,
  ...require("./agentBenchmarkRunner.js"),
  runAgentAcceptance: require("./agentAcceptances.js").runAgentAcceptance,
};
