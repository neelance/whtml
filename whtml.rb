require "nokogiri"

module WHTML
  module Processor
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
    
    class Context
      attr_reader :out, :parent, :custom_tags
      
      def initialize
        @out = IndentingOutput.new StringIO.new
        @element_counter = 0
        @parent = "parent"
        @custom_tags = []
      end
      
      def new_element_id(prefix)
        @element_counter += 1
        "#{prefix}#{@element_counter}"
      end
      
      def with_parent(new_parent)
        old_parent = @parent
        @parent = new_parent
        yield
        @parent = old_parent
      end
    end
    
    class ProcessedValue
      attr_reader :js_code, :dependencies
      
      def initialize(value)
        @dependencies = []
        s = StringScanner.new value
        parts = []
        while s.scan_until /@[\w]+/
          parts << process_text_part(s.pre_match) unless s.pre_match.empty?
          parts << "context['attr_#{s.matched[1..-1]}']"
          @dependencies << s.matched[1..-1]
        end
        parts << process_text_part(s.rest) unless s.rest.empty?
        @js_code = join_parts parts
      end
      
      def dependency_array
        "[#{@dependencies.map{ |d| "'#{d}'" }.join ', '}]"
      end
    end
    
    class ProcessedStringValue < ProcessedValue
      def join_parts(parts)
        parts.join " + "
      end
      
      def process_text_part(part)
        "'#{Processor.escape_js_string part}'"
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
    
    def self.parse(source, part_name)
      doc = Nokogiri::XML.parse("<?xml version=\"1.0\"?><root xmlns:whtml=\"http://whtml.net/whtml\" xmlns:widgets=\"http://whtml.net/widgets\">#{source}</root>")
      context = Context.new
      
      context.out.write_block "WHTML.parts['#{part_name}'].create = function(parent) {", "}" do
        context.out.puts "var context = this;"
        doc.root.children.each do |child|
          process_content_node child, context
        end
      end
      
      context.custom_tags.each do |node|
        attribute_names = node["attributes"].split(",")
        
        context.out.write_block "WHTML.customTags['#{node["name"]}'] = Class.create(WHTML.CustomTag, {", "});" do
          attribute_names.each do |attr_name|
            context.out.puts "get#{attr_name.capitalize}: function() { return this['attr_#{attr_name}']; },"
            context.out.puts "set#{attr_name.capitalize}: function(value) { this['attr_#{attr_name}'] = value; this.attributeChanged('#{attr_name}'); },"
          end
          
          context.out.write_block "initialize: function(parent, attributes, block) {", "}" do
            context.out.puts "this.attrChangeListeners = { #{attribute_names.map{ |n| "'#{n}': []" }.join(', ')} };"
            context.out.puts "var context = this;"
            attribute_names.each do |attr_name|
              context.out.puts "this['attr_#{attr_name}'] = attributes['#{attr_name}'];"
            end
            node.children.each do |child|
              process_content_node child, context
            end
          end
        end
      end
      
      context.out.puts "WHTML.parts['#{part_name}'].scriptLoaded();"
      context.out.string
    end
    
    def self.process_content_node(node, context)
      case node
      when Nokogiri::XML::Element
        if node.namespace and node.namespace.href == "http://whtml.net/whtml"
          case node.name
          when "customtag"
            context.custom_tags << node
          when "yield"
            context.out.puts "block(#{context.parent});"
          when "case"
            case_element_id = context.new_element_id "case"
            value = ProcessedStringValue.new node["value"]
            context.out.puts "#{case_element_id} = new WHTML.Case(#{context.parent}, function() { return #{value.js_code}; });"
            node.children.each do |when_node|
              next if when_node.text?
              raise unless when_node.namespace and when_node.namespace.href == "http://whtml.net/whtml" and when_node.name == "when"
              when_element_id = context.new_element_id "when"
              cond = ProcessedStringValue.new when_node["cond"]
              context.out.puts "#{when_element_id} = #{case_element_id}.when(function() { return #{cond.js_code}; });"
              context.with_parent when_element_id do
                when_node.children.each do |child|
                  process_content_node child, context
                end
              end
            end
          else
            puts "invalid tag: #{node.name}"
          end
        elsif node.namespace and node.namespace.href == "http://whtml.net/widgets"
          context.out.write_block "#{node.attributes["id"] ? "window.#{node.attributes["id"]} = " : ""}new WHTML.customTags['#{node.namespace.prefix}:#{node.name}'](#{context.parent}, {#{node.attribute_nodes.map{ |attr| "'#{attr.name}': '#{attr.value}'" }.join(", ")}}, function(parent) {", "});" do
            context.with_parent "parent" do
              node.children.each do |child|
                process_content_node child, context
              end
            end
          end
        elsif node.name == "script" and (node["type"].nil? or node["type"] == "text/javascript")
          context.out.puts "currentElement = #{context.parent};"
          value = ProcessedCodeValue.new node.text
          context.out.write value.js_code
        else
          element_id = context.new_element_id node.name
          attributes = node.attribute_nodes
          
          oncreate_attr = attributes.find { |attr| attr.name == "oncreate" and attr.namespace.href == "http://whtml.net/whtml" }
          oncreate_value = oncreate_attr && ProcessedCodeValue.new(oncreate_attr.value)
          
          element_creation = lambda do
            if oncreate_attr
              attributes.delete oncreate_attr
              context.out.write "(function() { #{oncreate_value.js_code} }).call(#{element_id});"
            end
            
            attributes.each do |attr|
              if attr.name =~ /^on/
                value = ProcessedCodeValue.new attr.value
                context.out.puts "Event.observe(#{element_id}, '#{attr.name[2..-1]}', function() { #{value.js_code} })"
              else
                value = ProcessedStringValue.new attr.value
                context.out.puts "this.dynamicSetAttribute(#{element_id}, '#{attr.name}', function() { return #{value.js_code}; }, #{value.dependency_array});"
              end
            end
          end
          
          if oncreate_attr.nil? or oncreate_value.dependencies.empty?
            context.out.puts "#{element_id} = document.createElement('#{node.name}');"
            element_creation.call
            context.out.puts "#{context.parent}.appendChild(#{element_id});"
          else
            context.out.write_block "this.dynamicCreateElement('#{node.name}', #{context.parent}, #{oncreate_value.dependency_array}, function(#{element_id}) {", "});" do
              element_creation.call
            end
          end
          
          context.with_parent element_id do
            node.children.each do |child|
              process_content_node child, context
            end
          end
        end
      when Nokogiri::XML::Text
        context.out.puts "#{context.parent}.appendChild(document.createTextNode('#{escape_js_string node.text}'));"
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