# Latitude LLM

# How to build Dockerimages?

Usually you just need to run `docker compose up --build` and it will work. But
if you're updating the production build of an app you need to change the [target](https://docs.docker.com/compose/compose-file/build/#target) in the docker compose app you want to update

## Drizzle Studio

You can open a DB UI with the following command:

```bash
docker compose exec web pnpm:db:studio
```

And then IMPORTANT: change host from `0.0.0.0` to `localhost`
https://local.drizzle.studio/?host=localhost
