import axios from "axios";

export async function sendTestWebhook(data) {
  const testWebhookUrl = process.env.TEST_WEBHOOK_URL;

  if (!testWebhookUrl) {
    throw new Error("TEST_WEBHOOK_URL não foi definida no arquivo .env");
  }

  const response = await axios.post(testWebhookUrl, data, {
    timeout: 10000,
  });

  return response.data;
}