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

    Path render(int page, int dpi) throws IOException;

    @Override
    void close() throws IOException;
}
