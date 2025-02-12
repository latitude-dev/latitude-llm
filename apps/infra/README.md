# Infra

Infra about how we do the setup of the infra for the project.

## Pulumi setup

Go to pulumi CLI [installation guide](https://www.pulumi.com/docs/install/) if
you didn't install it yet.

### How to add a secret

Set pulumi config values (can be encrypted with --secret)

```bash
pulumi config --stack core set [EXAMPLE_KEY] [example-secret] --secret
```

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
