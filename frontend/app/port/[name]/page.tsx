import { getPort } from "../../../lib/api";
import PortView from "../../../components/PortView";
export default async function PortPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: routeName } = await params;
  // Accept the encoded coordinate name as well as Next's decoded route value.
  let name = routeName;
  try {
    name = decodeURIComponent(routeName);
  } catch {
    /* Invalid input is reported by the API. */
  }
  const data = await getPort(name).catch(() => null);
  return <PortView name={name} data={data} />;
}
