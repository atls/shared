export const getArguments = () => {
  const [configString, targetDir] = process.argv.slice(2);
  return { configString, targetDir };
};
