import { Client, Connection } from "@temporalio/client"
import { config } from "./config"

let _client: Client | null = null
let _connection: Connection | null = null

export async function getTemporalClient(): Promise<Client> {
  if (_client) return _client

  const { address, namespace, apiKey } = config().temporal

  _connection = await Connection.connect({
    address,
    tls: apiKey ? true : undefined,
    apiKey,
  })
  _client = new Client({ connection: _connection, namespace })

  return _client
}
