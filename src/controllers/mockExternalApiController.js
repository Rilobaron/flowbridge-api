export async function receiveExternalData(req, res) {
  console.log("Data received by simulated external API:", req.body);

  if (req.body?.simulateFailure === true) {
    return res.status(500).json({
      success: false,
      message: "Simulated external API failure",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Data received by simulated external API",
    receivedData: req.body,
  });
}