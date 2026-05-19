const ragRuntime = await import('@gitcat/ai-pipeline/rag') as any;
const store = new ragRuntime.LocalVectorStore();
const indexedDocuments = documents.map((document) => ({
  id: document.id,
  content: [
    document.title,
    document.file_path,
    document.source_type,
    document.content,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n'),
  metadata: { runtimeRagDocument: document },
}));

await store.addDocuments(indexedDocuments);