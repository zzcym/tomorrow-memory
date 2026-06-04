// 部署脚本：上传代码 + 数据库到服务器并启动
const { NodeSSH } = require('node-ssh');
const path = require('path');
const fs = require('fs');

const HOST = '106.15.0.124';
const USER = 'root';
const PASS = 'cic@22915';
const REMOTE_DIR = '/opt/vocab';

const FILES = [
  'index.html',
  'style.css',
  'script.js',
  'server.js',
  'package.json',
  'package-lock.json',
  'admin.html',
  'ecosystem.config.js',
  'ec-cedict.json',
  '.gitignore',
];

const DB_FILES = ['stardict.db', 'examples.db'];

async function deploy() {
  const ssh = new NodeSSH();

  console.log('Connecting to server...');
  await ssh.connect({ host: HOST, username: USER, password: PASS, tryKeyboard: true });
  console.log('Connected!');

  // 创建远程目录
  await ssh.execCommand(`mkdir -p ${REMOTE_DIR}`);

  // 上传代码文件
  console.log('Uploading code files...');
  for (const file of FILES) {
    const local = path.join(__dirname, file);
    if (fs.existsSync(local)) {
      await ssh.putFile(local, `${REMOTE_DIR}/${file}`);
      console.log(`  ${file}`);
    }
  }

  // 上传数据库文件（如果本地比远程新）
  console.log('Uploading database files...');
  for (const file of DB_FILES) {
    const local = path.join(__dirname, file);
    if (fs.existsSync(local)) {
      // 检查远程是否存在
      const check = await ssh.execCommand(`test -f ${REMOTE_DIR}/${file} && echo "exists"`);
      if (check.stdout.includes('exists')) {
        console.log(`  ${file} (already exists on server, skipping)`);
      } else {
        console.log(`  ${file} (uploading, this may take a while...)`);
        await ssh.putFile(local, `${REMOTE_DIR}/${file}`);
        console.log(`  ${file} done`);
      }
    }
  }

  // 安装依赖
  console.log('Installing npm dependencies...');
  let result = await ssh.execCommand(`cd ${REMOTE_DIR} && npm install --production 2>&1`, { cwd: REMOTE_DIR });
  console.log(result.stdout.slice(-200));
  if (result.stderr) console.error(result.stderr.slice(-200));

  // 停止所有旧进程（包括 PM2）
  console.log('Stopping old server...');
  await ssh.execCommand(`pm2 stop tomorrow-memory 2>/dev/null; pm2 delete tomorrow-memory 2>/dev/null; true`);
  await ssh.execCommand(`pkill -f "node server.js" 2>/dev/null; true`);
  await ssh.execCommand(`lsof -ti:3001 | xargs kill -9 2>/dev/null; true`);
  // 等待端口释放
  await new Promise(r => setTimeout(r, 2000));

  // 启动新服务（使用 PM2）
  console.log('Starting new server...');
  await ssh.execCommand(`cd ${REMOTE_DIR} && pm2 start ecosystem.config.js`);
  await ssh.execCommand(`pm2 save`);

  setTimeout(async () => {
    const test = await ssh.execCommand(`curl -s http://localhost:3001/api/lookup?word=hello`);
    console.log('Test:', test.stdout.slice(0, 200));
  }, 2000);

  console.log('Deploy complete!');
  ssh.dispose();
}

deploy().catch(err => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});
