import { GoogleAuth } from "google-auth-library";

const scopes = ["https://www.googleapis.com/auth/cloud-platform"];

export const createGoogleAuthenticationAdapter = ({
  createGoogleAuth = () => new GoogleAuth({ scopes }),
} = {}) => {
  const googleAuth = createGoogleAuth();
  let client;

  return {
    getProjectId: () => googleAuth.getProjectId(),
    async getRequestHeaders(url, { forceRefresh = false } = {}) {
      client ??= await googleAuth.getClient();
      if (forceRefresh) {
        if (typeof client.setCredentials !== "function") {
          throw new Error(
            "Google authentication client cannot refresh rejected credentials",
          );
        }
        client.setCredentials({ ...client.credentials, expiry_date: 0 });
      }
      return client.getRequestHeaders(url);
    },
  };
};
