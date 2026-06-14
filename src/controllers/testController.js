import { sendTestWebhook } from "../services/testWebhookService.js";

export async function sendTest(req, res) {
  const testPayload = req.body?.payload || {
    name: "Lead Teste FlowBridge",
    email: "lead.teste@email.com",
    phone: "11999999999",
    origin: "test-endpoint",
    simulateFailure: false,
  };

  const webhookData = {
    source: req.body?.source || "flowbridge-test",
    eventType: req.body?.eventType || "lead.created",
    payload: testPayload,
  };

  const result = await sendTestWebhook(webhookData);

  return res.status(200).json({
    success: true,
    message: "Test webhook sent successfully",
    sentData: webhookData,
    webhookResponse: result,
  });
}