import { requireProjectBySlug } from "@/lib/auth";
import { getBook } from "@/lib/latex/build";
import { setProjectLogo } from "@/app/actions/projects";
import { ImageUploadField } from "@/components/ImageUploadField";
import { CoverForm } from "./CoverForm";

export default async function CoverPage({ params }: PageProps<"/projects/[slug]/cover">) {
  const { slug } = await params;
  const { project } = await requireProjectBySlug(slug);
  const book = await getBook();
  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Cover page</h1>
        <p className="mt-1 text-sm text-slate-500">
          The cover is laid out automatically from these fields. The institution logo, academic year and copyright line
          are the same for every project and set by the administrator.
        </p>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
          <div className="card space-y-5 p-6">
            <CoverForm project={project} />
            <div>
              <span className="label">Project logo</span>
              <ImageUploadField
                assetId={project.logoAssetId}
                projectId={project.id}
                save={setProjectLogo.bind(null, project.id)}
                hint="PNG with a transparent background works best. It is printed 13 cm wide in the middle of the cover."
              />
            </div>
          </div>
          <CoverPreview
            name={project.name}
            tagline={project.tagline}
            description={project.description}
            reportType={project.reportType}
            logoAssetId={project.logoAssetId}
            instLogoAssetId={book.institutionLogoAssetId}
            academicYear={book.academicYear}
            copyright={book.copyright}
          />
        </div>
      </div>
    </main>
  );
}

/** An approximate, scaled-down picture of the printed cover. */
function CoverPreview(p: {
  name: string;
  tagline: string;
  description: string;
  reportType: string;
  logoAssetId: string | null;
  instLogoAssetId: string | null;
  academicYear: string;
  copyright: string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Preview</div>
      <div
        className="relative aspect-[210/297] w-full overflow-hidden bg-white shadow-md"
        style={{ fontFamily: '"Times New Roman", Times, serif', containerType: "inline-size" }}
      >
        <div className="absolute inset-y-0 left-0 w-[4.8%] bg-[rgb(18,78,111)]" />
        <div className="absolute" style={{ left: "13.3%", top: "8.4%", width: "28.6%" }}>
          {p.instLogoAssetId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/assets/${p.instLogoAssetId}`} alt="" className="w-full" />
          )}
        </div>
        <div className="absolute font-bold text-[rgb(75,75,75)]" style={{ left: "13.3%", top: "19.2%", fontSize: "2.35cqw" }}>
          {p.reportType}
        </div>
        <div
          className="absolute font-bold leading-tight text-[rgb(18,78,111)]"
          style={{ left: "13.3%", top: "24.2%", width: "76%", fontSize: "4cqw" }}
        >
          {p.name}
          {p.tagline && (
            <>
              :<br />
              {p.tagline}
            </>
          )}
        </div>
        <div className="absolute text-[rgb(75,75,75)]" style={{ left: "13.3%", top: "31.6%", width: "66.7%", fontSize: "1.76cqw", lineHeight: 1.33 }}>
          {p.description}
        </div>
        {p.logoAssetId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/assets/${p.logoAssetId}`}
            alt=""
            className="absolute object-contain"
            style={{ left: "19%", top: "42.4%", width: "62%", maxHeight: "37%" }}
          />
        )}
        <div className="absolute inset-x-0 text-center font-bold text-[rgb(18,78,111)]" style={{ top: "87.5%", fontSize: "2.35cqw" }}>
          Academic Year {p.academicYear}
        </div>
        <div className="absolute inset-x-0 text-center text-[rgb(75,75,75)]" style={{ top: "92.6%", fontSize: "2cqw" }}>
          {p.copyright}
        </div>
      </div>
    </div>
  );
}
