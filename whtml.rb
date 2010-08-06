require "nokogiri"

module WHTML
  class Processor
    class IndentingOutput
      def initialize(io)
        @io = io
        @indentation = 0
      end
      
      def puts(line)
        @io.puts(("  " * @indentation) + line)
      end
      
      def write(lines)
        lines.split("\n").each do |line|
          self.puts line.strip 
        end
      end
      
      def indent
        @indentation += 1
        yield
        @indentation -= 1
      end
      
      def write_block(header, footer)
        self.puts header if header
        self.indent do
          yield
        end
        self.puts footer if footer
      end
      
      def string
        @io.string
      end
    end
    
    class ProcessedValue
      attr_reader :js_code, :dependencies
      
      def initialize(value)
        @dependencies = []
        s = StringScanner.new value
        parts = []
        loop do
          s.scan /(.*?)@([\w]+)/m or break
          parts << process_text_part(s[1]) unless s[1].empty?
          parts << "context['attr_#{s[2]}'].getValue()"
          @dependencies << s[2]
        end
        parts << process_text_part(s.rest) unless s.rest.empty?
        @js_code = join_parts parts
      end
      
      def dependency_array
        "[#{@dependencies.map{ |d| "context.attributeDependencyFor('#{d}')" }.join ', '}]"
      end
    end
    
    class ProcessedStringValue < ProcessedValue
      def join_parts(parts)
        parts.join " + "
      end
      
      def process_text_part(part)
        "'#{Processor.escape_js_string part}'"
      end
      
      def to_dynamic_value
        if dependency_array.empty?
          "new WHTML.SimpleValue(#{js_code})"
        else
          "new WHTML.DynamicValue(function() { return #{js_code}; }, #{dependency_array})"
        end
      end
    end
    
    class ProcessedCodeValue < ProcessedValue
      def join_parts(parts)
        parts.join
      end
      
      def process_text_part(part)
        part
      end
    end
    
    def initialize
      @element_counter = 0
      @out = IndentingOutput.new StringIO.new
      @custom_tags = {}
    end
    
    def new_element_id(prefix)
      @element_counter += 1
      "#{prefix}#{@element_counter}"
    end
    
    def parse(source, part_name)
      doc = Nokogiri::XML.parse("<?xml version=\"1.0\"?><root xmlns:whtml=\"http://whtml.net/whtml\" xmlns:widgets=\"http://whtml.net/widgets\">#{source}</root>")
      
      parent_id = new_element_id "parent"
      @out.write_block "WHTML.parts['#{part_name}'].create = function(#{parent_id}) {", "}" do
        @out.puts "var context = this;"
        doc.root.children.each do |child|
          process_content_node child, parent_id
        end
      end
      
      @custom_tags.each do |name, node|
        attribute_names = (node["attributes"] || "").split(",")
        
        @out.write_block "WHTML.customTags['#{node["name"]}'] = Class.create(WHTML.CustomTag, {", "});" do
          attribute_names.each do |attr_name|
            @out.puts "get#{attr_name.capitalize}: function() { return this['attr_#{attr_name}'].getValue(); },"
            @out.puts "set#{attr_name.capitalize}: function(value) { this['attr_#{attr_name}'] = new WHTML.SimpleValue(value); this.attributeChanged('#{attr_name}'); },"
          end

          parent_id = new_element_id "parent"
          @out.write_block "appendTo: function(#{parent_id}) {", "}" do
            @out.puts "var context = this;"
            if node["type"] == "text/javascript"
              @out.puts "var parent = #{parent_id};"
              value = ProcessedCodeValue.new node.text
              @out.write value.js_code
            else
              node.children.each do |child|
                process_content_node child, parent_id
              end
            end
          end
        end
      end
      
      @out.puts "WHTML.parts['#{part_name}'].scriptLoaded();"
      @out.string
    end
    
    def process_content_node(node, parent)
      case node
      when Nokogiri::XML::Element
        if node.namespace and node.namespace.href == "http://whtml.net/whtml" and not @custom_tags["#{node.namespace.prefix}:#{node.name}"]
          case node.name
          when "customtag"
            @custom_tags[node["name"]] = node
          when "yield"
            @out.puts "#{parent}.yield(context);"
          when "region"
            parent_id = new_element_id "parent"
            @out.puts "var #{parent_id} = #{node['parent']};"
            node.children.each do |child|
              process_content_node child, parent_id
            end
          else
            puts "invalid tag: #{node.name}"
          end
        elsif node.name == "script" and (node["type"].nil? or node["type"] == "text/javascript")
          @out.puts "var parent = #{parent};"
          value = ProcessedCodeValue.new node.text
          @out.write value.js_code
        else
          if node.attributes["id"]
            element_id = "window.#{node.attributes["id"]}"
          else
            element_id = new_element_id node.name
            @out.puts "var #{element_id};"
          end

          attributes = node.attribute_nodes
          oncreate_attr = attributes.find { |attr| attr.name == "oncreate" and attr.namespace.href == "http://whtml.net/whtml" }
          oncreate_value = oncreate_attr && ProcessedCodeValue.new(oncreate_attr.value)
          
          element_creation = lambda do
            if oncreate_attr
              attributes.delete oncreate_attr
              @out.write "(function() { #{oncreate_value.js_code} }).call(#{element_id});"
            end
            
            attributes.each do |attr|
              if attr.name =~ /^on/
                value = ProcessedCodeValue.new attr.value
                @out.puts "Event.observe(#{element_id}, '#{attr.name[2..-1]}', function() { #{value.js_code} })"
              else
                value = ProcessedStringValue.new attr.value
                if value.dependencies.empty?
                  @out.puts "#{element_id}.writeAttribute('#{attr.name}', #{value.js_code});"
                else
                  @out.puts "WHTML.dynamicAttributeFor(#{element_id}, '#{attr.name}').set(#{value.to_dynamic_value});"
                end
              end
            end
          end
          
          if oncreate_attr.nil? or oncreate_value.dependencies.empty?
            @out.puts "#{element_id} = WHTML.createElement('#{node.namespace ? "#{node.namespace.prefix}:#{node.name}" : node.name}');"
            element_creation.call
          else
            @out.write_block "#{element_id} = new WHTML.DynamicElement('#{node.name}', function() { return #{oncreate_value.dependency_array}; }, function(#{element_id}) {", "});" do
              element_creation.call
            end
          end

          unless node.children.empty?
            @out.write_block "#{element_id}.setChildFunction(function() {", "});" do
              node.children.each do |child|
                process_content_node child, element_id
              end
            end
          end
          
          @out.puts "#{element_id}.appendTo(#{parent});"
        end
      when Nokogiri::XML::Text
        @out.puts "#{parent}.appendChild(document.createTextNode('#{Processor.escape_js_string node.text}'));"
      when Nokogiri::XML::Comment
        # ignore
      else
        raise RuntimeError
      end
    end
    
    def self.escape_js_string(string)
      string = string.dup
      string.gsub! "\n", "\\n"
      string.gsub! "'", "\\\\'"
      string
    end
  end
end