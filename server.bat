call corepack enable
call corepack prepare pnpm@11.0.9 --activate
call pnpm install
call pnpm run build
call pnpm run runserver
