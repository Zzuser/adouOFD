package com.adou.ofd.document;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

public interface DocumentHandle extends AutoCloseable {

    int pageCount();

    List<PageMeta> pages();

    boolean signed();

    List<OutlineItem> outline();

    List<TextRun> pageText(int page) throws IOException;

    DocumentMetadata metadata();

    Path render(int page, int dpi, int rotate) throws IOException;

    default Path render(int page, int dpi) throws IOException {
        return render(page, dpi, 0);
    }

    @Override
    void close() throws IOException;
}
