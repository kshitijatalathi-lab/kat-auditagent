"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AgentixUXPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/wizard");
  }, [router]);
  return null;
}
