require "whtml"

whtml_file = $*[0]
raise if not whtml_file or whtml_file.empty? or not File.exist? whtml_file
js_file = "#{whtml_file[0..-7]}.js"
raise if File.exist? js_file

File.open(js_file, "w") do |out|
  out.write WHTML::Processor.parse(IO.read(whtml_file), whtml_file[0..-7])
end
