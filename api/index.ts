export default function handler(req: any, res: any) {
  res.status(200).json({ status: "API operational via single bundle" });
}