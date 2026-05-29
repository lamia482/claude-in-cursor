const readline = require('readline');
const { log } = require('./log');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

function askSecret(query) {
  if (!process.stdin.isTTY) {
    log('⚠️ 非交互终端，API Key 将以明文输入', 'yellow');
    return askQuestion(query);
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(query);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');

    let input = '';

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
    };

    const onData = (chunk) => {
      const ch = chunk.toString();

      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        cleanup();
        resolve(input);
        return;
      }

      if (ch === '\u0003') {
        cleanup();
        process.exit(130);
      }

      if (ch === '\u007f' || ch === '\b') {
        input = input.slice(0, -1);
        return;
      }

      if (ch === '\u0015') {
        input = '';
        return;
      }

      input += ch;
    };

    stdin.on('data', onData);
  });
}

async function askChoice(title, options) {
  console.log(`\n${title}`);
  options.forEach(opt => {
    console.log(`  [${opt.id}] ${opt.label}`);
  });

  const answer = (await askQuestion('\n请选择: ')).trim();
  return answer;
}

async function askConfirm(message, defaultYes = false) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = (await askQuestion(`${message} (${hint}): `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}

module.exports = { askQuestion, askSecret, askChoice, askConfirm };
