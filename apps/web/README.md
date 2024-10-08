# NextJS project on Latitude

This is the nextjs app tha powers Latitude website. This is readme is used to
explain technical details about the project.

## How to run data migrations?

Latitude use PostgreSQL as database. We use Drizzle ORM and Drizzle Kit CLI to
run schema migrations.

For data migrations we use custom scripts placed on
`./apps/web/scripts/data-migrations/*.ts` folder.

To develop a new data migration create a file in that folder and run it with
[tsx](https://tsx.is/) like this:

```bash
pnpm tsx ./scripts/data-migrations/your-migration.ts
```

When your changes are deployed to production you have to connect to production
server and run the compiled version of that file.

```bash
# Connect to production server
node ./scripts-dist/data-migrations/your-migration.mjs
```
