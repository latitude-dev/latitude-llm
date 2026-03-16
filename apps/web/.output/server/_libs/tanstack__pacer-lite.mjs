var LiteThrottler = class {
  constructor(fn, options) {
    this.fn = fn;
    this.options = options;
    this.lastExecutionTime = 0;
    this.isPending = false;
    this.maybeExecute = (...args) => {
      const timeSinceLastExecution = Date.now() - this.lastExecutionTime;
      if (this.options.leading && timeSinceLastExecution >= this.options.wait) this.execute(...args);
      else {
        this.lastArgs = args;
        if (!this.timeoutId && this.options.trailing) {
          const timeoutDuration = this.options.wait - timeSinceLastExecution;
          this.isPending = true;
          this.timeoutId = setTimeout(() => {
            if (this.lastArgs !== void 0) this.execute(...this.lastArgs);
          }, timeoutDuration);
        }
      }
    };
    this.execute = (...args) => {
      this.fn(...args);
      this.options.onExecute?.(args, this);
      this.lastExecutionTime = Date.now();
      this.clearTimeout();
      this.lastArgs = void 0;
      this.isPending = false;
    };
    this.flush = () => {
      if (this.isPending && this.lastArgs) this.execute(...this.lastArgs);
    };
    this.cancel = () => {
      this.clearTimeout();
      this.lastArgs = void 0;
      this.isPending = false;
    };
    this.clearTimeout = () => {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = void 0;
      }
    };
    if (this.options.leading === void 0 && this.options.trailing === void 0) {
      this.options.leading = true;
      this.options.trailing = true;
    }
  }
};
function liteThrottle(fn, options) {
  return new LiteThrottler(fn, options).maybeExecute;
}
export {
  liteThrottle as l
};
