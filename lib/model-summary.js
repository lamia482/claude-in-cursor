const { log } = require('./log');

function getProviderLabel(config) {
  return `${config.profileName || config.provider || 'Provider'} (${config.provider || 'custom'})`;
}

function getProviderModelSummaryLines(config) {
  const provider = config.provider || 'provider';
  return [
    `当前 API 来源: ${getProviderLabel(config)}`,
    `Base URL: ${config.baseUrl}`,
    `ANTHROPIC_MODEL: ${config.model}`,
    `Opus: ${config.opusModel}`,
    `Sonnet: ${config.sonnetModel}`,
    `Haiku: ${config.haikuModel}`,
    `Subagent: ${config.subagentModel}`,
    '',
    '修改方式:',
    '1. 编辑项目根目录的 config.json，修改 provider/model/opusModel/sonnetModel/haikuModel/subagentModel。',
    `2. 保存后重新运行 node setup.js --provider ${provider}，或直接运行 node setup.js 让脚本读取 config.json。`,
    '3. 只切换已配置 profile 时，可运行 node change.js --providers 查看来源，再用 node change.js <provider> 切换。',
  ];
}

function printProviderModelSummary(config) {
  log('\n📌 当前 API 模型配置', 'blue');
  for (const line of getProviderModelSummaryLines(config)) {
    console.log(line ? `  ${line}` : '');
  }
}

module.exports = {
  getProviderModelSummaryLines,
  printProviderModelSummary,
};
