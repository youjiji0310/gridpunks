require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: {
    hardhat: { blockGasLimit: 100_000_000 },
    robinhood: { url: process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com", chainId: 4663, accounts },
    robinhoodTestnet: { url: process.env.TESTNET_RPC_URL || "", chainId: 46630, accounts },
  },
};

// Use the npm solc (solcjs) so compiling works without downloading binaries.
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === "0.8.24") {
    const p = require.resolve("solc/soljson.js");
    return { compilerPath: p, isSolcJs: true, version: args.solcVersion, longVersion: require("solc").version() };
  }
  return runSuper();
});
