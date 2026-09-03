import Event from "../models/Event.js";
import Delivery from "../models/Delivery.js";
import Integration from "../models/Integration.js";

export async function getPrometheusMetrics(req, res) {
  const [eventStats, deliveryStats, activeIntegrations] = await Promise.all([
    Event.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
    Delivery.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
    Integration.countDocuments({ enabled: true, isDeleted: false }),
  ]);

  const memory = process.memoryUsage();
  const uptime = Math.round(process.uptime());

  let output = "";

  // Uptime & Sistema
  output += "# HELP flowbridge_uptime_seconds Tempo de atividade da aplicacao em segundos\n";
  output += "# TYPE flowbridge_uptime_seconds gauge\n";
  output += `flowbridge_uptime_seconds ${uptime}\n\n`;

  output += "# HELP flowbridge_active_integrations Total de integracoes ativas cadastradas\n";
  output += "# TYPE flowbridge_active_integrations gauge\n";
  output += `flowbridge_active_integrations ${activeIntegrations}\n\n`;

  // Memória Node.js
  output += "# HELP nodejs_memory_heap_used_bytes Memoria Heap utilizada pelo Node.js\n";
  output += "# TYPE nodejs_memory_heap_used_bytes gauge\n";
  output += `nodejs_memory_heap_used_bytes ${memory.heapUsed}\n\n`;

  output += "# HELP nodejs_memory_heap_total_bytes Memoria Heap total alocada\n";
  output += "# TYPE nodejs_memory_heap_total_bytes gauge\n";
  output += `nodejs_memory_heap_total_bytes ${memory.heapTotal}\n\n`;

  // Eventos por status
  output += "# HELP flowbridge_events_total Total de eventos registrados por status\n";
  output += "# TYPE flowbridge_events_total counter\n";
  for (const item of eventStats) {
    output += `flowbridge_events_total{status="${item._id}"} ${item.count}\n`;
  }
  output += "\n";

  // Deliveries por status
  output += "# HELP flowbridge_deliveries_total Total de entregas HTTP executadas por status\n";
  output += "# TYPE flowbridge_deliveries_total counter\n";
  for (const item of deliveryStats) {
    output += `flowbridge_deliveries_total{status="${item._id}"} ${item.count}\n`;
  }

  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return res.status(200).send(output);
}
