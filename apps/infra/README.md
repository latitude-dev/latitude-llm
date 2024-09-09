# Infra

Infra about how we do the setup of the infra for the project.

## Pulumi setup

Go to pulumi CLI [installation guide](https://www.pulumi.com/docs/install/) if
you didn't install it yet.

### Set pulumi config values (can be encrypted with --secret)

Pulumi store screts encrypted in the state files like `Pulumi.core.yaml` or
`Pulumi.web-production.yaml1`.

```bash
pulumi config set AWS_ACCESS_KEY [your-access-key] --secret
```

### Do changes

Make your changes and run. It will show the changes and ask for permision

```bash
pulumi up
```

It will ask you for Pulumi Passphrase. Is in 1Password. ask for permissions if
you can't find wit "Pulumi Passphrase".
