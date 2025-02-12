# Infra

Infra about how we do the setup of the infra for the project.

## Pulumi setup

Go to pulumi CLI [installation guide](https://www.pulumi.com/docs/install/) if
you didn't install it yet.

### How to add a secret to web

Set pulumi config values (can be encrypted with --secret)

Pulumi store screts encrypted in the state files like `Pulumi.core.yaml` or
`Pulumi.web-production.yaml`.

```bash
// 1. Set the secret in core stack
pulumi config --stack core set [EXAMPLE_KEY] [example-secret] --secret

// 2. Upload the secret to core stack
pulumi up --stack core

// 3. Update web task definition with new env var
pulumi up --stack app-production-web

// 4. Update gateway task definition with new env var
pulumi up --stack app-production-gateway
```

By default all secrets are added in the stack 'core'.

### View pulumi stacks

```bash
 pulumi stack ls
```

## Cancel a Pulumi deployment

```bash
pulumi cancel --stack [stack-name]
```

### View secrets

You need pulumi passphrase to view secrets.

```bash
pulumi config --stack core --show-secrets
```

It will ask you for Pulumi Passphrase. Is in 1Password. ask for permissions if
you can't find wit "Pulumi Passphrase".
