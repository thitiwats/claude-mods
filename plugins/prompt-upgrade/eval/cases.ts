// Prompts a developer might hand /prompt-upgrade: short and long, vague and clear, Thai and English.
export const CASES: { name: string; prompt: string }[] = [
  { name: 'vague-en', prompt: 'fix the login bug' },
  { name: 'vague-th', prompt: 'ช่วยทำให้ API เร็วขึ้นหน่อย' },
  { name: 'clear-en', prompt: 'Rename the function `getUserData` to `fetchUser` in src/api/user.ts and update every call site. Do not touch tests.' },
  {
    name: 'constraints-en',
    prompt:
      'Add rate limiting to the /api/upload endpoint in server/routes/upload.js. Limit is 10 requests per minute per user. Must use the existing Redis client in server/lib/redis.js, no new dependencies. Return HTTP 429 with body {"error":"too many requests"}.',
  },
  {
    name: 'constraints-th',
    prompt:
      'เขียน GitHub Actions workflow สำหรับ deploy ไป staging ตอน push เข้า branch develop ใช้ Node 20 และต้องรัน `npm test` ก่อน ห้ามใช้ self-hosted runner',
  },
  {
    name: 'code-snippet',
    prompt:
      'Why does this return undefined?\n\n```js\nconst items = [1, 2, 3].forEach(x => x * 2)\nconsole.log(items)\n```\n\nExplain briefly, I only want the fix in one line.',
  },
  { name: 'quote', prompt: 'Change the error toast text to exactly "Something went wrong — please try again." and keep the em dash.' },
  {
    name: 'long-th',
    prompt:
      'อยากให้ช่วย refactor service `OrderService` ใน `apps/shop/src/order/order.service.ts` ตอนนี้มันยาว 900 บรรทัด มีทั้ง logic คำนวณราคา ส่วนลด และการเรียก payment gateway ปนกันหมด อยากแยกเป็นไฟล์ย่อยตามหน้าที่ แต่ห้ามเปลี่ยน public method signature เพราะมี controller อื่นเรียกใช้อยู่ 5 ที่ และต้องให้ unit test เดิมผ่านทั้งหมด ไม่ต้องเขียน test ใหม่',
  },
  { name: 'ambiguous-scope', prompt: 'write docs for this project' },
  { name: 'mixed-lang', prompt: 'ช่วยเขียน Terraform สร้าง S3 bucket ให้หน่อย เปิด versioning ด้วย' },
  {
    name: 'already-detailed',
    prompt:
      'Write a bash script `backup.sh` that tars /var/www into /backups/www-YYYY-MM-DD.tar.gz, keeps only the 7 newest archives, exits non-zero on any failure (set -euo pipefail), and logs each step to stdout with a timestamp. No external tools beyond coreutils and tar.',
  },
  { name: 'numbers', prompt: 'Make the cache TTL 15 minutes instead of 5 and bump the max entries to 2,000.' },
]
