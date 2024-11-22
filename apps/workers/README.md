### Remove bull jobs from queue

How many bull jobs are in the queue?

```bash
$ redis-cli --scan --pattern 'bull:*' | wc -l
```

Remove all bull jobs from the queue

```bash
$ redis-cli --scan --pattern 'bull:*' | xargs -L 100 redis-cli del
```
