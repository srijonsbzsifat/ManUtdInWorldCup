import Image from "next/image";

export function LoadingSpinner({
  text = "Loading...",
}: {
  text?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-united-red animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Image src="/manutd-crest.png" alt="" width={40} height={40} />
        </div>
      </div>
      <p className="text-sm text-white/50 animate-pulse">{text}</p>
    </div>
  );
}
