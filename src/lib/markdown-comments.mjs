const blankExceptLineBreaks = (value) => value.replace(/[^\r\n]/g, " ");

export const blankMarkdownComments = (source) => {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const opening = source.indexOf("<!--", index);
    if (opening === -1) {
      output += source.slice(index);
      break;
    }

    output += source.slice(index, opening);
    const closing = source.indexOf("-->", opening + 4);
    const end = closing === -1 ? source.length : closing + 3;
    output += blankExceptLineBreaks(source.slice(opening, end));
    index = end;
  }

  return output;
};
