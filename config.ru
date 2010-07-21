require "whtml"

app = proc do |env|
  local_path = (env["REQUEST_PATH"] == "/") ? "index.html" : env["REQUEST_PATH"][1..-1]
  result = nil
  
  case ::File.extname(local_path)
  when ".html"
    result = [200, {"Content-Type" => "text/html"}, [IO.read(local_path)]] if ::File.file? local_path
    
  when ".js"
    whtml_path = "#{local_path[0..-4]}.whtml"
    if ::File.file? whtml_path
      result = [200, {"Content-Type" => "text/javascript"}, [WHTML::Processor.parse(IO.read(whtml_path), local_path[0..-4])]]
    elsif ::File.file? local_path
      result = [200, {"Content-Type" => "text/javascript"}, [IO.read(local_path)]]
    end
    
  end

  result ||= [404, {"Content-Type" => "text/html"}, ["Not found"]]
  result
end

run app