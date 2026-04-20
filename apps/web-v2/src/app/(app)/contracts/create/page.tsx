"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function CreateContractPage() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <AppPageHeader
        title="New contract"
        description="Draft a standing order, volume commitment, or index-linked agreement."
        actions={
          <Button size="sm" variant="secondary" onClick={() => router.push("/contracts")}>
            <ArrowLeft className="h-4 w-4" /> Back to contracts
          </Button>
        }
      />
      <EmptyState
        image="/illustrations/contracts-hero.png"
        title="Contract builder — coming soon"
        description="Use the AI Contract Assistant in an existing contract to draft clauses, or contact Matex support to set up your first supply agreement."
        cta={{ label: "Back to contracts", onClick: () => router.push("/contracts") }}
        secondaryCta={{ label: "Open chat", href: "/chat" }}
        size="lg"
      />
    </div>
  );
}
