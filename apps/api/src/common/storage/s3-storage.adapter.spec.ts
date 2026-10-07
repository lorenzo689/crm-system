import { buildAttachmentDisposition } from './s3-storage.adapter';

describe('buildAttachmentDisposition', () => {
  it('keeps plain ASCII names readable', () => {
    expect(buildAttachmentDisposition('Preisliste.pdf')).toBe(
      `attachment; filename="Preisliste.pdf"; filename*=UTF-8''Preisliste.pdf`,
    );
  });

  it('encodes umlauts via filename* and uses an ASCII fallback', () => {
    const header = buildAttachmentDisposition('Prüfbericht Größe.pdf');

    expect(header).toContain('filename="Pr_fbericht Gr__e.pdf"');
    expect(header).toContain(
      "filename*=UTF-8''Pr%C3%BCfbericht%20Gr%C3%B6%C3%9Fe.pdf",
    );
  });

  it('cannot break out of the quoted filename', () => {
    const header = buildAttachmentDisposition('a"b\\c\'d.pdf');

    expect(header).toContain('filename="a_b_c\'d.pdf"');
    expect(header).toContain("filename*=UTF-8''a%22b%5Cc%27d.pdf");
  });
});
