import axios from "axios";

export async function sendToExternalApi(data) {
  const externalApiUrl = process.env.EXTERNAL_API_URL;

  if (!externalApiUrl) {
    throw new Error("EXTERNAL_API_URL não foi definida no arquivo .env");
  }

  const response = await axios.post(externalApiUrl, data, {
    timeout: 5000,
  });

  return response.data;
}