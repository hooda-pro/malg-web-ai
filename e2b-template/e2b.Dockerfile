# Template أكبر للـ sandbox بتاع run_command — مبني على الـ base الرسمي بتاع E2B
# (نفس الأدوات: Python 3، Node.js، git، build-essential)، بنزوّد عليه pnpm.
# الرام والـ CPU بيتحددوا وقت البناء (--memory-mb / --cpu-count) — شوف README.md في نفس المجلد.
FROM e2bdev/base:latest

# pnpm بياخد رام أقل بكتير من npm في التثبيت (بيعمل hardlinks من store واحد).
RUN npm install -g pnpm@latest && pnpm --version
