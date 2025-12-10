export const getNetworkUrl = ({
  domain,
  domainSubfolder,
}: {
  domain: string;
  domainSubfolder?: string;
}): string => {
  return domainSubfolder ? `https://${domainSubfolder}` : `https://${domain}`;
};

export const getHubspotAppUrl = (url: string, appId: string): string => {
  return `${url}/manage/app-store/apps/${appId}`;
};
