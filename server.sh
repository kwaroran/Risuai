corepack enable
corepack prepare pnpm@11.0.9 --activate
pnpm install
pnpm run build
pnpm run runserver
