<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:noNamespaceSchemaLocation="slate-xslt-schema.xsd">

  <Container id="root">
    <Card id="badges">
      <Card.Header id="badges-header" title="Select a badge to configure" withBorder="true" />
      <Card.Content id="badges-content" className="flex flex-wrap gap-3">
        <xsl:for-each select="badges/badge">
          <Button id="badge-{id}"
            callbackId="{$selectBadgeCallbackId}_{id}"
            variant="primary"
            rounded="true"
            disabled="{id = $selectedBadge/id}"
            text="{if (id = $selectedBadge/id) then concat('✓ ', name) else name}"
            className="bg-[{backgroundColor}] text-[{textColor}] border-0" />
        </xsl:for-each>
        <xsl:if test="not(badges/badge)">
          <Text id="no-badges-text-l1" value="No badges were found in the network" />
          <Text id="no-badges-text-l2" value="Please create some badges in the community site and come back to configure them here." />
        </xsl:if>
      </Card.Content>
    </Card>
    <xsl:if test="$selectedBadge">
      <Card id="card-badge-config">
        <Card.Header id="card-badge-config-header" title="{$selectedBadge/name}" withBorder="true" />
        <Card.Content id="card-badge-config-content" className="space-y-3">
          <Form id="card-badge-config-form" callbackId="{$saveBadgeConfigCallbackId}">
            <Input id="badge-name" name="badge-name" value="{$selectedBadge/name}" hidden="true" />
            <Input id="badge-id" name="badge-id" value="{$selectedBadge/id}" hidden="true" />
            <Card id="card-badge-config-conditions">
              <Card.Header id="card-badge-config-conditions-header" title="Conditions" withBorder="true" />
              <Card.Content id="card-badge-config-conditions-content" className="space-y-3">
                <Container id="if-container">
                  <Text id="badge-config-conditions-if-text" value="IF" />
                  <Input id="badge-config-conditions-if-object" name="if-object" value="# of posts" label="Object" readOnly="true" disabled="true" />
                  <Input id="badge-config-conditions-if-operator" name="if-operator" value=">=" label="Operator" readOnly="true" disabled="true" />
                  <Input id="badge-config-conditions-if-value" name="if-value" label="Value" placeholder="Enter a value" required="true" value="{$ifValue}" type="number" min="0" max="100" pattern="[1-9][0-9]*" />
                </Container>
                <Container id="in-container">
                  <Text id="badge-config-conditions-in-text" value="IN" />
                  <Input id="badge-config-conditions-in-window" name="in-window" value="Last N days" label="Window" readOnly="true" disabled="true" />
                  <Input id="badge-config-conditions-in-operator" name="in-operator" value="=" label="Operator" readOnly="true" disabled="true" />
                  <Input id="badge-config-conditions-in-value" name="in-value" label="Value (max {$postDaysWindowLimit} days)" placeholder="Enter a value" required="true" value="{$inValue}" type="number" min="1" max="{$postDaysWindowLimit}" pattern="[1-9][0-9]*" />
                </Container>
                <Button id="save" type="submit" name="save" variant="primary" text="Save Configuration" />
              </Card.Content>
            </Card>
          </Form>
        </Card.Content>
      </Card>
    </xsl:if>
  </Container>
</xsl:stylesheet>