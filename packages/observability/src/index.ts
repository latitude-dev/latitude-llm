export const createLogger = (scope: string) => {
  return {
    info: (message: string) => console.log(`[${scope}] ${message}`),
  };
};
